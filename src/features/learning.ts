/**
 * SPEC_040: 학습 기록 저장소를 볼트 안 `<플러그인 폴더>/learning.json`에 붙인다.
 * 파일은 처음 쓸 때 읽는다(onload를 늦추지 않음). 쓰기 실패는 진단 기록으로.
 */
import { normalizePath, Plugin } from "obsidian";
import { LearningStore } from "../services/learningStore";
import { diagnostics } from "../services/diagnostics";

export const LEARNING_FILE_NAME = "learning.json";

export function createLearningStore(plugin: Plugin): LearningStore {
  const filePath = () => normalizePath(`${plugin.manifest.dir ?? `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`}/${LEARNING_FILE_NAME}`);
  return new LearningStore(
    {
      read: async () => {
        const adapter = plugin.app.vault.adapter;
        const p = filePath();
        return (await adapter.exists(p)) ? adapter.read(p) : null;
      },
      write: (text) => plugin.app.vault.adapter.write(filePath(), text),
    },
    undefined,
    (err) => diagnostics.record("학습 기록", err)
  );
}
