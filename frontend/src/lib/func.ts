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

export type SettingData = SettingDataMastodon | SettingDataBluesky;

export type SettingType = SettingData['type'];

export type SettingDataType<T extends SettingType> =
  T extends 'mastodon' ? SettingDataMastodon :
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

export function saveMessage(data: { message: string }) {
  localStorage.setItem(`ppp_message`, JSON.stringify(data));
}
export function loadMessage(): { message: string } | null {
  const text = localStorage.getItem(`ppp_message`);
  if ((text?.length ?? 0) <= 0 ) return null;
  return JSON.parse(text!);
}
