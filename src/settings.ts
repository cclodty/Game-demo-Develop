import { DEFAULT_SETTINGS, type Settings } from './config';

const KEY = 'm1-threejs-settings-v1';

/** 讀取記在瀏覽器裡的設定；無法存取時（隱私視窗等）直接用預設值。 */
export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 無法儲存時忽略，本次遊玩仍使用目前設定
  }
}
