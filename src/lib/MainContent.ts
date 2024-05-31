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

export const postToSns = async (text: string, imageDataURLs: string[]): Promise<{ errors: string[] }> => {
  const errors: string[] = [];

  const enableTypes = Array.from(Object.entries(postTo)).filter(([_, v]) => v).map(([k, v]) => (k as SettingType));

  const promises = [];
  
  for (const type of enableTypes) {
    switch (type) {
    case 'mastodon':
      promises.push(postToMastodon(text, imageDataURLs).then((r) => { if (!r) errors.push('Mastodon') }));
      break;
    case 'bluesky':
      promises.push(postToBluesky(text, imageDataURLs).then((r) => { if (!r) errors.push('Bluesky') }));
      break;
    case 'twitter':
      promises.push(postToTwritter(text, imageDataURLs).then((r) => { if (!r) errors.push('Twitter') }));
      break;
    }

    await Promise.allSettled(promises);
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

async function url2File(url: string, fileName: string): Promise<File>{
  const blob = await (await fetch(url)).blob()
  return new File([blob], fileName, {type: blob.type})
}

const postToMastodon = async (text: string, images: string[]): Promise<boolean> => {
  try {
    const settings = postSettings.mastodon!;
    const MASTODON_HOST = settings.server;
    const ACCESS_TOKEN = settings.token_data.access_token;
    const status = text;

    const media_ids = await (async () => {
      const ids = [];
      for (const dataURL of images) {

        const file = await url2File(dataURL, 'image003.png');
        const formData = new FormData();
        formData.append('file', file);
    
        const res = await fetch(`https://${MASTODON_HOST}/api/v1/media`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
          },
          body: formData,
        });

        if (res.ok) {
          const j = await res.json();
          ids.push(j.id);
          console.log(`j`, j)
        } else {
          console.error(`j`, [res.status, res.statusText, await res.json()])
          
        }

        return ids.length > 0 ? ids : undefined;
      }
    })();

    const res = await fetch(`https://${MASTODON_HOST}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, media_ids }),
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

const postToBluesky = async (text: string, imageDataURLs: string[]): Promise<boolean> => {
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

    const getWidHei = (image: string) => {
      return new Promise<any>(r => {
        const img = new Image();
        img.onload = () => {
          r({ width: img.width, height: img.height });
        }
        img.src = image;        
      })
    };

    const embedImages = await (async () => {
      const images = [];
      for (const image of imageDataURLs) {
        const file = await url2File(image, 'image');
        const arr = await file.arrayBuffer();
    
        const dataArray: Uint8Array = new Uint8Array(arr);
        const { data: result } = await agent.uploadBlob(
          dataArray,
          {
            encoding: file.type,
          }
        );

        const { width, height } = await getWidHei(image);        
  
        images.push({
          alt: file.name,
          image: result.blob, // 画像投稿時にレスポンスをここで渡すことにより、投稿と画像を紐付け
          aspectRatio: {
            // 画像のアスペクト比を指定 (指定しないと真っ黒になるので注意)
            width,
            height
          }
        });
      }

      if (images.length <= 0) {
        return undefined;
      }

      return {
        $type: 'app.bsky.embed.images',
        images
      };
    })();


    // creating richtext
    const rt = new RichText({
      text,
    });

    await rt.detectFacets(agent) // automatically detects mentions and links

    const getOgp = async (url: string) => {
      try {
        const proxyUrl = `${Config.API_ENDPOINT}/cors_proxy?url=${encodeURIComponent(url)}`;
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

    const embedOgp = await (async () => {
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
      embed: embedImages ?? embedOgp,
    };

    await agent.post(postRecord);       
    return true;
  } catch (error) {
    console.error(`postToBluesky -> error:`, error);
    return false;
  }
}; 

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    console.log('readAsDataURL start', new Date().getTime());
    reader.readAsDataURL(file);
    reader.onload = (r) => {
      console.log('readAsDataURL end', new Date().getTime());
      console.log('replace start', new Date().getTime());
      const prefix = `data:${file.type}:base64,`;
      const base64str = (r.target?.result as string).substring(prefix.length);
      console.log('replace end', new Date().getTime());
      resolve(base64str);
    };
    reader.onerror = (e) => reject(e);
  });
};

const uploadImage = async (content: string /*file: File*/): Promise<string | null> => {

  const conf: { url: string, branch_name: string, token: string } = await (async () => {
    const r = await fetch(`${Config.API_ENDPOINT}/github_put_url`);
    if (r.ok) {
      const resJson = await r.json();
      return resJson;
    } else {
      return null;
    }
  })();

  const data = {
    branch: conf.branch_name,
    message: 'upload image via PPPOST',
    content: `${content}`
  };

  const p = {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${conf.token}`,
    },
    body: JSON.stringify(data)
  };

  const res = await fetch(conf.url, p);
  if (res.ok) {
    const resJson = await res.json();
    console.log(`doUpload ~ resJson`, resJson, resJson.content.download_url);

    return resJson.content.download_url;
  } else {
    return null;
  }
}

const postToTwritter = async (text: string, images: string[]): Promise<boolean> => {
  try {
    const settings = postSettings.twitter!;
    const token = settings.token_data.token;

    const imgs: string[] = [];
    for (const dataURI of images) {
      const image = dataURI.split(',')[1]
      const imageUrl = await uploadImage(image);
      if (imageUrl != null) {
        imgs.push(imageUrl);
      }
    }

    /*
    const images: string[] = [
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII',
    ];
    */
    const res = await fetch(`${Config.API_ENDPOINT}/twitter_post`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ token, text, images: imgs }),
    });

    if (res.ok) {
      const resJson = await res.json();
      console.log(`FIXME 後で消す  -> postToTwritter -> resJson:`, resJson);
    } else {
      return false;
    }
    return true;       
  } catch (error) {
    console.error(`postToMastodon -> error:`, error);
    return false;       
  }
};    
