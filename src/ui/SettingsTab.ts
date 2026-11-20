import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { isMobileApp } from "../utils/platform";
import { generateBookmarkletCode } from "../utils/youtubeUrlParser";
import { UnlockStep } from "../types/transcript";
import type EarCoachPlugin from "../main";
import { ANKI_MESSAGES, ANKI_ROLES, AnkiConnectError, AnkiRole, remapFieldsForModel } from "../services/anki";

/** SPEC_015: 필드 대응 화면에 보일 역할 이름 */
const ANKI_ROLE_LABELS: Record<AnkiRole, string> = {
  sentence: "문장(빈칸)",
  picture: "그림(영상 장면)",
  meaning: "영어 뜻",
  word: "단어",
  ipa: "발음기호",
  audio: "발음 소리",
  source: "출처(영상 링크)",
};

/**
 * Settings tab for configuring `agy` CLI path, bookmarklet generator, WPM threshold, and default blind step.
 */
export class EarCoachSettingTab extends PluginSettingTab {
  /** SPEC_015: 「덱·노트 타입 불러오기」로 받은 목록(이 화면에서만) */
  private ankiDecks: string[] | null = null;
  private ankiModels: string[] | null = null;
  private ankiFields: string[] | null = null;

  constructor(
    app: App,
    private plugin: EarCoachPlugin
  ) {
    super(app, plugin);
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    if (isMobileApp()) {
      containerEl.createEl("h2", {
        text: "🎧 Obsidian Ear-Coach (모바일) 설정",
      });
      this.displayMobileGuideBanner(containerEl);
      this.displayCommonSettings(containerEl);
      this.displayAnkiSettings(containerEl);
    } else {
      containerEl.createEl("h2", {
        text: "🎧 Obsidian Ear-Coach (YouTube + agy CLI) 설정",
      });
      this.displayDesktopBookmarkletSection(containerEl);
      this.displayCommonSettings(containerEl);
      this.displayAnkiSettings(containerEl);
      this.displayDesktopAgyCliSettings(containerEl);
    }
  }

  private displayMobileGuideBanner(containerEl: HTMLElement): void {
    const mobileBox = containerEl.createDiv({
      cls: "ear-coach-bookmarklet-box",
    });
    mobileBox.createEl("h4", {
      text: "📱 안드로이드/모바일 리스닝 모드 안내",
    });
    mobileBox.createEl("p", {
      text: "모바일 환경에서는 상단 고정 YouTube 플레이어와 A-B 문장 무한루프, 3단계 블라인드, 마이크로 딕테이션이 지원됩니다. (로컬 agy CLI / 사운드 닥터는 데스크톱 전용이며, PC에서 이미 분석해 둔 노트의 힌트와 기록은 모바일에서도 그대로 확인할 수 있습니다.)",
    });
  }

  private displayDesktopBookmarkletSection(containerEl: HTMLElement): void {
    // 1. Zero-Friction Browser Bookmarklet Section
    const bookmarkletBox = containerEl.createDiv({
      cls: "ear-coach-bookmarklet-box",
    });
    bookmarkletBox.createEl("h4", {
      text: "⚡ 원클릭 브라우저 북마클릿 (유튜브 보다가 안 들릴 때 즉시 캡처)",
    });
    bookmarkletBox.createEl("p", {
      text: "아래 버튼을 눌러 코드를 복사한 뒤, 크롬/엣지 북마크바에 새 북마크로 등록하세요. 유튜브 시청 중 클릭하면 현재 재생 시점(초)에 📌 집중 분석 핀이 찍힌 채로 Obsidian이 열립니다!",
    });

    new Setting(bookmarkletBox)
      .setName("브라우저 북마클릿 코드 복사")
      .setDesc(generateBookmarkletCode())
      .addButton((btn) =>
        btn
          .setButtonText("📋 북마클릿 복사")
          .setCta()
          .onClick(async () => {
            await navigator.clipboard.writeText(generateBookmarkletCode());
            new Notice("북마클릿 코드가 복사되었습니다! 브라우저 북마크 URL란에 붙여넣으세요.");
          })
      );
  }

  private displayCommonSettings(containerEl: HTMLElement): void {
    // 2. Folder & Dashboard paths
    new Setting(containerEl)
      .setName("리스닝 노트 저장 폴더")
      .setDesc("생성된 유튜브 리스닝 마크다운 노트가 저장될 폴더 경로입니다.")
      .addText((text) =>
        text
          .setPlaceholder("YouTube Listening")
          .setValue(this.plugin.settings.notesFolder)
          .onChange(async (value) => {
            this.plugin.settings.notesFolder = value.trim() || "YouTube Listening";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("내 귀의 사각지대(약점 대시보드) 파일 경로")
      .setDesc("안 들리는 발음 패턴 통계가 자동 누적되는 마크다운 파일 경로입니다.")
      .addText((text) =>
        text
          .setPlaceholder("YouTube Listening/My_Listening_Weakness.md")
          .setValue(this.plugin.settings.weaknessDashboardPath)
          .onChange(async (value) => {
            this.plugin.settings.weaknessDashboardPath =
              value.trim() || "YouTube Listening/My_Listening_Weakness.md";
            await this.plugin.saveSettings();
          })
      );

    // 4. Listening Training Preferences
    new Setting(containerEl)
      .setName("기본 블라인드 단계 (Default Unlock Step)")
      .setDesc("노트를 처음 열었을 때 문장 카드의 기본 표시 단계를 선택합니다.")
      .addDropdown((drop) =>
        drop
          .addOption("0", "Step 0: 🙈 완전 블라인드 (소리에만 집중)")
          .addOption("1", "Step 1: 🦴 뼈대 단어 + 빈칸 받아쓰기")
          .addOption("2", "Step 2: 💡 한글 소리/연음 힌트")
          .addOption("3", "Step 3: 📖 전체 자막 공개")
          .setValue(String(this.plugin.settings.defaultUnlockStep))
          .onChange(async (value) => {
            this.plugin.settings.defaultUnlockStep = Number(value) as UnlockStep;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("🚀 과속 발화(Speed Spike) 기준 WPM")
      .setDesc("분당 단어 수(WPM)가 이 값을 넘으면 과속 주의 배지를 표시합니다.")
      .addSlider((slider) =>
        slider
          .setLimits(130, 240, 5)
          .setValue(this.plugin.settings.speedSpikeWpmThreshold)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.speedSpikeWpmThreshold = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private displayDesktopAgyCliSettings(containerEl: HTMLElement): void {
    // 3. agy CLI settings (Desktop Only)
    new Setting(containerEl)
      .setName("agy CLI 실행 파일 경로")
      .setDesc("기본값은 'agy'입니다. 연결 확인 버튼으로 정상 작동 여부를 테스트하세요.")
      .addText((text) =>
        text
          .setPlaceholder("agy")
          .setValue(this.plugin.settings.agyBinaryPath)
          .onChange(async (value) => {
            this.plugin.settings.agyBinaryPath = value.trim() || "agy";
            await this.plugin.saveSettings();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("🔌 agy 연결 테스트").onClick(async () => {
          const ok = await this.plugin.agyService.checkAgyAvailable();
          if (ok) {
            new Notice("✅ agy CLI가 정상적으로 감지되었습니다!");
          } else {
            new Notice("⚠️ agy CLI를 실행할 수 없습니다. PATH 또는 경로를 확인해 주세요.");
          }
        })
      );

    new Setting(containerEl)
      .setName("사용할 AI 모델 (AI Model)")
      .setDesc("실시간 질의 및 배치 분석에 사용할 모델입니다. (기본값: Gemini 3.8 Flash)")
      .addDropdown((drop) =>
        drop
          .addOption("gemini-3.8-flash", "⚡ Gemini 3.8 Flash (빠른 반응속도, 실시간 추천 ⭐)")
          .addOption("gemini-4-argon", "🧠 Gemini 4 Argon (High - 정밀 음운 분석)")
          .addOption("gemini-2.5-pro", "📚 Gemini 2.5 Pro")
          .setValue(this.plugin.settings.agyModel || "gemini-3.8-flash")
          .onChange(async (value) => {
            this.plugin.settings.agyModel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("노트 생성 시 agy 자동 배치 분석 실행")
      .setDesc("유튜브 노트를 처음 만들 때 백그라운드에서 agy CLI로 연음·약화 함정을 자동 태깅합니다.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoRunAgyBatchOnCreate)
          .onChange(async (value) => {
            this.plugin.settings.autoRunAgyBatchOnCreate = value;
            await this.plugin.saveSettings();
          })
      );
  }

  /** SPEC_015: AnkiConnect Android — 덱·노트 타입·필드 대응·태그 */
  private displayAnkiSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "🗂️ Anki 카드 저장 (AnkiConnect Android)" });
    const st = this.plugin.settings;
    const save = async () => this.plugin.saveSettings();

    new Setting(containerEl)
      .setName("덱·노트 타입 불러오기")
      .setDesc("AnkiDroid와 AnkiConnect Android 앱이 켜져 있어야 합니다.")
      .addButton((btn) =>
        btn.setButtonText("🔄 덱·노트 타입 불러오기").onClick(async () => {
          try {
            this.ankiDecks = await this.plugin.anki.invoke("deckNames");
            this.ankiModels = await this.plugin.anki.invoke("modelNames");
            await this.loadAnkiFields();
            new Notice(`덱 ${this.ankiDecks?.length ?? 0}개, 노트 타입 ${this.ankiModels?.length ?? 0}개를 불러왔습니다`);
          } catch (e) {
            new Notice(e instanceof AnkiConnectError && e.kind === "connection" ? ANKI_MESSAGES.connection : `Anki 오류: ${String((e as Error)?.message ?? e)}`);
          }
          this.display();
        })
      );

    const deck = new Setting(containerEl).setName("덱");
    if (this.ankiDecks && this.ankiDecks.length > 0) {
      deck.addDropdown((d) => {
        for (const n of this.ankiDecks!) d.addOption(n, n);
        if (!this.ankiDecks!.includes(st.ankiDeck)) d.addOption(st.ankiDeck, st.ankiDeck);
        d.setValue(st.ankiDeck).onChange(async (v) => {
          st.ankiDeck = v;
          await save();
        });
      });
    } else {
      deck.addText((t) =>
        t.setValue(st.ankiDeck).onChange(async (v) => {
          st.ankiDeck = v.trim();
          await save();
        })
      );
    }

    const model = new Setting(containerEl).setName("노트 타입").setDesc("기본: Basic (and reversed card) — 앞면 빈칸 문장·뜻, 뒷면 단어·발음기호·발음·출처");
    if (this.ankiModels && this.ankiModels.length > 0) {
      model.addDropdown((d) => {
        for (const n of this.ankiModels!) d.addOption(n, n);
        if (!this.ankiModels!.includes(st.ankiNoteType)) d.addOption(st.ankiNoteType, st.ankiNoteType);
        d.setValue(st.ankiNoteType).onChange(async (v) => {
          st.ankiNoteType = v;
          await this.loadAnkiFields();
          await save();
          this.display();
        });
      });
    } else {
      model.addText((t) =>
        t.setValue(st.ankiNoteType).onChange(async (v) => {
          st.ankiNoteType = v.trim();
          await save();
        })
      );
    }

    for (const role of ANKI_ROLES) {
      const row = new Setting(containerEl).setName(`필드: ${ANKI_ROLE_LABELS[role]}`);
      const cur = st.ankiFieldMap[role] ?? "";
      if (this.ankiFields && this.ankiFields.length > 0) {
        row.addDropdown((d) => {
          d.addOption("", "(넣지 않음)");
          for (const f of this.ankiFields!) d.addOption(f, f);
          d.setValue(this.ankiFields!.includes(cur) ? cur : "").onChange(async (v) => {
            st.ankiFieldMap = { ...st.ankiFieldMap, [role]: v };
            await save();
          });
        });
      } else {
        row.addText((t) =>
          t.setValue(cur).onChange(async (v) => {
            st.ankiFieldMap = { ...st.ankiFieldMap, [role]: v.trim() };
            await save();
          })
        );
      }
    }

    new Setting(containerEl)
      .setName("태그")
      .setDesc("띄어쓰기로 여러 개")
      .addText((t) =>
        t.setValue(st.ankiTags).onChange(async (v) => {
          st.ankiTags = v;
          await save();
        })
      );
  }

  /** 고른 노트 타입의 필드를 받아 대응을 맞춘다(Basic 한국어 판 등 필드 이름이 다를 때). */
  private async loadAnkiFields(): Promise<void> {
    const st = this.plugin.settings;
    try {
      const fields: string[] = await this.plugin.anki.invoke("modelFieldNames", { modelName: st.ankiNoteType });
      this.ankiFields = Array.isArray(fields) ? fields : null;
      if (this.ankiFields) st.ankiFieldMap = remapFieldsForModel(this.ankiFields, st.ankiFieldMap);
      await this.plugin.saveSettings();
    } catch {
      this.ankiFields = null;
    }
  }
}
