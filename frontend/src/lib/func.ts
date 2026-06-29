import type { AtpSessionData } from "@atproto/api";

export type SettingDataMastodon = {
  type: 'mastodon',
  title: 'Mastodon',
  enabled: boolean,
  server: string,
  token_data: {
    access_token: string,
    token_type: string,
    scope: string,
    created_at: number,
  }
};

export type SettingDataBluesky = {
  type: 'bluesky',
  title: 'Bluesky',
  enabled: boolean,
  data: {
    sessionData: AtpSessionData,
  }
};

export type SettingDataThreads = {
  type: 'threads',
  title: 'Threads',
  enabled: boolean,
  user_id: string,
  token_data: {
    access_token: string,
    token_type: string,
    expires_in: number,
    obtained_at: number,
  }
};

export type SettingData = SettingDataMastodon | SettingDataBluesky | SettingDataThreads;

export type SettingType = SettingData['type'];

export type SettingDataType<T extends SettingType> =
  T extends 'mastodon' ? SettingDataMastodon :
  T extends 'threads' ? SettingDataThreads :
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

export type PrGhostSetting = {
  enabled: boolean,
  intervalHours: number,
  texts: string[],
};

export type PrGhostState = {
  lastPostedAt: number,
  rotationIndex: number,
};

export function savePrGhostSetting(data: PrGhostSetting) {
  localStorage.setItem(`ppp_pr_ghost_setting`, JSON.stringify(data));
}

export function loadPrGhostSetting(): PrGhostSetting | null {
  const text = localStorage.getItem(`ppp_pr_ghost_setting`);
  if ((text?.length ?? 0) <= 0) return null;
  return JSON.parse(text!);
}

export function savePrGhostState(data: PrGhostState) {
  localStorage.setItem(`ppp_pr_ghost_state`, JSON.stringify(data));
}

export function loadPrGhostState(): PrGhostState | null {
  const text = localStorage.getItem(`ppp_pr_ghost_state`);
  if ((text?.length ?? 0) <= 0) return null;
  return JSON.parse(text!);
}

export function saveMessage(data: { message: string }) {
  localStorage.setItem(`ppp_message`, JSON.stringify(data));
}
export function loadMessage(): { message: string } | null {
  const text = localStorage.getItem(`ppp_message`);
  if ((text?.length ?? 0) <= 0 ) return null;
  return JSON.parse(text!);
}
