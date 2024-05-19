import { Config } from "../config";
import { type SettingDataMastodon, type SettingDataBluesky, type SettingDataTwitter, loadPostSetting, type SettingType, loadMessage, savePostSetting } from "./func";
import { BskyAgent, RichText, type AtpSessionData } from "@atproto/api";

export const postSettings: {
  mastodon: SettingDataMastodon | null,
  bluesky: SettingDataBluesky | null,
  twitter: SettingDataTwitter | null,
} = {
  mastodon: loadPostSetting('mastodon'),
  bluesky: loadPostSetting('bluesky'),
  twitter: loadPostSetting('twitter'),
};

export const postTo: { [K in SettingType]: boolean } = {
  mastodon: postSettings?.mastodon?.enabled ?? false,
  bluesky: postSettings?.bluesky?.enabled ?? false,
  twitter: postSettings?.twitter?.enabled ?? false,
};

export async function getApiVersion(): Promise<{ build_at: string, env_ver: string }> {

  const res = await fetch(`${Config.API_ENDPOINT}/ver`);

  if (res.ok) {
    const data = await res.json();
    return data;
  } else {
    return { build_at: 'unknown', env_ver: 'unknown' };
  }
}

export async function connectToTwitter(params: URLSearchParams) {
  const code = params.get('code') ?? '';

  const redirect_uri = encodeURIComponent(Config.post_targets.twitter.redirect_uri);
  const res = await fetch(`${Config.API_ENDPOINT}/twitter_token?code=${code}&redirect_uri=${redirect_uri}`);

  if (res.ok) {
    const data = await res.json();
    postSettings.twitter = { type: 'twitter', title: 'Twitter', enabled: true, access_token_response: { 
      refresh_token: data.refresh_token, 
      access_token: data.access_token 
    } };
    savePostSetting(postSettings.twitter);
    postTo.twitter = true;
    alert('Twitter に接続しました。');
  } else {
    console.error(`twitter 接続エラー -> res:`, res);
    alert('Twitter に接続できませんでした。');
  }
  
  const url = new URL(window.location.href);
  params.delete('code');
  params.delete('state');
  url.hash = '';
  url.search = params.toString();
  history.replaceState(null, '', url.toString());  
}

export const postToSns = async (text: string): Promise<{ errors: string[] }> => {
  const errors: string[] = [];

  const enableTypes = Array.from(Object.entries(postTo)).filter(([_, v]) => v).map(([k, v]) => (k as SettingType));
  for (const type of enableTypes) {
    switch (type) {
    case 'mastodon':
      if (!(await postToMastodon(text))) {
        errors.push('Mastodon');
      }
      break;
      case 'bluesky':
      if (!(await postToBluesky(text))) {
        errors.push('Bluesky');
      }
      break;
    case 'twitter':
      if (!(await postToTwritter(text))) {
        errors.push('Twitter');
      }
      break;
    }
  }

  if (errors.length == 0) {

    for (const [k, v] of Object.entries(postSettings)) {
      const type = k as SettingType;
      if (v != null) {
        v.enabled = postTo[type] == true;
        savePostSetting(v);
      }
    }
  }

  return { errors };
};  

const postToMastodon = async (text: string): Promise<boolean> => {
  try {
    const settings = postSettings.mastodon!;
    const MASTODON_HOST = settings.server;
    const ACCESS_TOKEN = settings.access_token_response.access_token;
    const status = text;
    const res = await fetch(`https://${MASTODON_HOST}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
    } else {
      return false;
    }
    return true;       
  } catch (error) {
    console.error(`postToMastodon -> error:`, error);
    return false;       
  }
};  

// RichTextからURLを取得する
async function findUrlInText(rt: RichText): Promise<string | null> {
  if ((rt?.facets?.length ?? 0) < 1) return null;
  for (const facet of rt?.facets ?? []) {
    if (facet.features.length < 1) continue;
    for (const feature of facet.features) {
      if (feature.$type != "app.bsky.richtext.facet#link") continue;
      else if (feature.uri == null) continue;
      return feature.uri as string;
    }
  }
  return null;
}

const postToBluesky = async (text: string): Promise<boolean> => {
  try {
    const agent = new BskyAgent({
      service: 'https://bsky.social',
    });

    // resume session


    const res = await agent.resumeSession(postSettings.bluesky?.data?.sessionData!);

    // refresh tokens
    await agent.refreshSession();
    postSettings.bluesky = { type: 'bluesky', title: 'Bluesky', enabled: true, data: { sessionData: agent.session as AtpSessionData } };
    savePostSetting(postSettings.bluesky);


    // creating richtext
    const rt = new RichText({
      text,
    });

    await rt.detectFacets(agent) // automatically detects mentions and links

    const getOgp = async (url: string) => {
      try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        const html = await response.text();
        const domParser = new DOMParser();
        const dom = domParser.parseFromString(html, 'text/html');
        const ogp = Object.fromEntries([...dom.head.children].filter(
          (element) =>
            element.tagName === 'META' &&
            element.getAttribute('property')?.startsWith('og:')
          ).map((element) => {
            return [
              element.getAttribute('property'),
              element.getAttribute('content')
            ];
          })
        );
        console.log(ogp);
        return ogp;          
      } catch (error) {
        console.error(`getOgp -> error:`, error);
        return undefined;
      }
      
    };

    const embed = await (async () => {
      const uri =  await findUrlInText(rt);
      if (uri == null) return undefined;

      const ogp = await getOgp(uri);
      if (ogp == null) return undefined;

      try {
        // fetchで画像データを取得
        const imageUrl = ogp['og:image'];
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(imageUrl)}`);
        const imageContentType = res.headers.get('content-type') ?? 'image/jpeg';
        console.log(res.headers);
        const buffer = await res.arrayBuffer();
        const imageData = new Uint8Array(buffer);
        
        // 画像をアップロードしてIDを取得
        const uploadedRes = await agent.uploadBlob(imageData, {
          encoding: imageContentType,
        });

        // OGP 付きで投稿
        return {
          $type: 'app.bsky.embed.external',
          external: {
            uri,
            thumb: {
              $type: "blob",
              ref: {
                $link: uploadedRes.data.blob.ref.toString(),
              },
              mimeType: uploadedRes.data.blob.mimeType,
              size: uploadedRes.data.blob.size,
            },            
            title: ogp['og:title'] ?? ' ',
            description: ogp['og:description'] ?? ' ',
          }
        }              
      } catch (error) {
        console.error(`embed -> error:`, error);
        return undefined;
      }
    })();

    const postRecord = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      embed,
    };

    await agent.post(postRecord);       
    return true;
  } catch (error) {
    console.error(`postToBluesky -> error:`, error);
    return false;
  }
}; 

const postToTwritter = async (text: string): Promise<boolean> => {
  try {
    const settings = postSettings.twitter!;
    const access_token = settings.access_token_response.access_token;
    const refresh_token = settings.access_token_response.refresh_token;

    const res = await fetch(`${Config.API_ENDPOINT}/twitter_post`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ access_token, refresh_token, text }),
    });

    if (res.ok) {
      const resJson = await res.json();
      console.log(`FIXME 後で消す  -> postToTwritter -> resJson:`, resJson);
      settings.access_token_response.refresh_token = resJson.refresh_token;
      settings.access_token_response.access_token = resJson.access_token;
      savePostSetting(settings);
    } else {
      return false;
    }
    return true;       
  } catch (error) {
    console.error(`postToMastodon -> error:`, error);
    return false;       
  }
};    

export const onChangePostSettings = () => {
  postSettings.mastodon = loadPostSetting('mastodon');
  postSettings.bluesky = loadPostSetting('bluesky');
  postSettings.twitter = loadPostSetting('twitter');

  Object.entries(postTo).forEach(([k, v]) => {
    postTo[k as SettingType] = postSettings?.[k as SettingType]?.enabled ?? false;
  });
};
