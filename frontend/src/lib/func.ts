export type SettingDataBluesky = {
  type: 'bluesky',
  title: 'Bluesky',
  enabled: boolean,
  handle: string,
  did: string,
};

export type SettingDataThreads = {
  type: 'threads',
  title: 'Threads',
  enabled: boolean,
  user_id: string,
};

export type SettingDataMisskey = {
  type: 'misskey',
  title: 'Misskey',
  enabled: boolean,
  host: string,
  username: string,
};

export type SettingData = SettingDataBluesky | SettingDataThreads | SettingDataMisskey;

export type SettingType = SettingData['type'];

export type SettingDataType<T extends SettingType> =
  T extends 'threads' ? SettingDataThreads :
  T extends 'misskey' ? SettingDataMisskey :
  SettingDataBluesky;

export function savePostSetting(data: SettingData) {
  localStorage.setItem(`ppp_setting_${data.type}`, JSON.stringify(data));
}

export function loadPostSetting<T extends SettingType>(type: T): SettingDataType<T> | null{
  const text = localStorage.getItem(`ppp_setting_${type}`);
  if ((text?.length ?? 0) <= 0 ) return null;
  return JSON.parse(text!);
}

export function deletePostSetting(type: SettingType) {
  localStorage.removeItem(`ppp_setting_${type}`);
}

// サーバー発行の匿名セッション ID（Bearer 認可に用いる）
export function saveSessionId(id: string) {
  localStorage.setItem(`ppp_session_id`, id);
}

export function loadSessionId(): string | null {
  const id = localStorage.getItem(`ppp_session_id`);
  return (id?.length ?? 0) > 0 ? id : null;
}

// PR ゴースト投稿設定はサーバー（D1）で管理するが、API の入出力型として利用する
export type PrGhostSetting = {
  enabled: boolean,
  intervalHours: number,
  texts: string[],
};

export function saveMessage(data: { message: string }) {
  localStorage.setItem(`ppp_message`, JSON.stringify(data));
}
export function loadMessage(): { message: string } | null {
  const text = localStorage.getItem(`ppp_message`);
  if ((text?.length ?? 0) <= 0 ) return null;
  return JSON.parse(text!);
}

// fetch にタイムアウトを設けるラッパー。タイムアウト時は AbortError が throw される。
export const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs: number = 30000): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};
