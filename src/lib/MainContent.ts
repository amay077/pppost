import type { ReplyRef } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { Config } from "../config";
import { type SettingDataMastodon, type SettingDataBluesky, type SettingDataTwitter, loadPostSetting, type SettingType, loadMessage, savePostSetting } from "./func";
import { BskyAgent, RichText, type AtpSessionData } from "@atproto/api";
import dayjs from "dayjs";

const bskyEndpoint = 'https://bsky.social';

export type Post = { text: string, url: string, posted_at: Date };
export type PresentedPost = {
  display_posted_at: string | undefined,
  trimmed_text: string,
  postOfType: { [K in SettingType]: Post | undefined },
  
}

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

export const loadMyPosts = async (): Promise<PresentedPost[]> => {

  const enableTypes = Array.from(Object.entries(postTo)).filter(([_, v]) => v).map(([k, v]) => (k as SettingType));

  const promises = [];
  
  for (const type of enableTypes) {
    switch (type) {
    case 'mastodon':
      promises.push(loadMyPostsMastodon().then(posts => ({ type: 'mastodon', posts })));
      break;
    case 'bluesky':
      promises.push(loadMyPostsBluesky().then(posts => ({ type: 'bluesky', posts })));
      break;
    case 'twitter':
      promises.push(loadMyPostsTwritter().then(posts => ({ type: 'twitter', posts })));
      break;
    }
  }  
  const posts = await Promise.allSettled(promises);

  const succeededPosts = posts.filter((p) => p.status == 'fulfilled').map(x => x.value).reduce((acc, cur) => {

    (cur?.posts ?? []).forEach((p) => {
      acc.push({ type: cur.type as SettingType, post: p });
    });
    
    return acc;
  }, [] as { type: SettingType, post: Post }[]);

  const trimText = (text: string) => {
    const max = 50;
    if (text.length > max) {
      return text.substring(0, max) + '...';
    } else {
      return text;
    }
  }

  const groupByText = (input: { type: SettingType, post: Post }[]): PresentedPost[] => {
    const grouped: { [key: string]: PresentedPost } = {};
  
    input.forEach(({ type, post }) => {
      const key = post.text.substring(0, 10);
      if (!grouped[key]) {
        grouped[key] = {
          display_posted_at: dayjs(post.posted_at).format('M/DD H:MM'),
          trimmed_text: trimText(post.text),
          postOfType: { mastodon: undefined, twitter: undefined, bluesky: undefined }
        };
      }
      grouped[key].postOfType[type] = post;
    });
  
    return Object.values(grouped);
  }
  
  const result = groupByText(succeededPosts ?? []);
  console.log(result);

  return result;

  return succeededPosts.map((p) => {
    return {
      display_posted_at: dayjs(p.post.posted_at).format('M/DD H:MM'),
      trimmed_text: trimText(p.post.text),
      postOfType: {
        mastodon: p.type == 'mastodon' ? p.post : undefined,
        bluesky: p.type == 'bluesky' ? p.post : undefined,
        twitter: p.type == 'twitter' ? p.post : undefined,
      }
    }
  });
}

export const postToSns = async (text: string, imageDataURLs: string[], options: { reply_to_ids: {
  mastodon: string,
  bluesky: string,
  twitter: string,
}}): Promise<{ errors: string[] }> => {
  const errors: string[] = [];

  const enableTypes = Array.from(Object.entries(postTo)).filter(([_, v]) => v).map(([k, v]) => (k as SettingType));

  const promises = [];
  
  for (const type of enableTypes) {
    switch (type) {
    case 'mastodon':
      promises.push(postToMastodon(text, imageDataURLs, options?.reply_to_ids?.mastodon).then((r) => { if (!r) errors.push('Mastodon') }));
      break;
    case 'bluesky':
      promises.push(postToBluesky(text, imageDataURLs, options?.reply_to_ids?.bluesky).then((r) => { if (!r) errors.push('Bluesky') }));
      break;
    case 'twitter':
      promises.push(postToTwritter(text, imageDataURLs, options?.reply_to_ids?.twitter).then((r) => { if (!r) errors.push('Twitter') }));
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

const postToMastodon = async (text: string, images: string[], reply_to_id: string): Promise<boolean> => {
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

      }
      return ids.length > 0 ? ids : undefined;
    })();

    // const res = await fetch(`https://${MASTODON_HOST}/api/v1/statuses`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${ACCESS_TOKEN}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({ status, media_ids }),
    // });

    const res = await fetch(`${Config.API_ENDPOINT}/mastodon_post`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ host: MASTODON_HOST, token: settings.token_data.access_token, status, media_ids, reply_to_id }),
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

const loadMyPostsBluesky = async (): Promise<Post[]> => {
  try {
    const agent = new BskyAgent({
      service: bskyEndpoint,
    });

    // resume session
    const sessionRes = await agent.resumeSession(postSettings.bluesky?.data?.sessionData!);
    const did = sessionRes?.data?.did;

    // refresh tokens
    await agent.refreshSession();
    postSettings.bluesky = { type: 'bluesky', title: 'Bluesky', enabled: true, data: { sessionData: agent.session as AtpSessionData } };
    savePostSetting(postSettings.bluesky);

    const res = await agent.getAuthorFeed({ actor: did });

    return (res?.data?.feed ?? []).map((p) => {
      const post = p.post;
      const postid = post.uri.substring(post.uri.lastIndexOf('/') + 1);
      const url = `https://bsky.app/profile/${post.author.handle}/post/${postid}`;

      const posted_at = (post.record as any)['createdAt'] ?? post.indexedAt;

      const text = `${(post.record as any)['text']}`;

      return { text, url, posted_at };
    });
  } catch (error) {
    console.error(`postToBluesky -> error:`, error);
    return [];
  }
}; 

const loadMyPostsTwritter = async (): Promise<Post[]> => {
  try {
    const settings = postSettings.twitter!;
    const token = settings.token_data.token;

    const res = await fetch(`${Config.API_ENDPOINT}/twitter_posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ token }),
    });

    if (res.ok) {
      const resJson = await res.json();
      console.log(`FIXME 後で消す  -> loadMyPostsTwritter -> resJson:`, resJson);
      return resJson;
    } else {
      return [];
    }
  } catch (error) {
    console.error(`loadMyPostsTwritter -> error:`, error);
    return [];       
  }
};    

const loadMyPostsMastodon = async (): Promise<Post[]> => {
  try {
    const settings = postSettings.mastodon!;
    const host = settings.server;
    const token = settings.token_data.access_token;

    const res = await fetch(`${Config.API_ENDPOINT}/mastodon_posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ host, token }),
    });

    if (res.ok) {
      const resJson = await res.json();
      console.log(`FIXME 後で消す  -> loadMyPostsMastodon -> resJson:`, resJson);
      return resJson;
    } else {
      return [];
    }
  } catch (error) {
    console.error(`loadMyPostsMastodon -> error:`, error);
    return [];       
  }
};    


const postToBluesky = async (text: string, imageDataURLs: string[], reply_to_id: string): Promise<boolean> => {
  try {
    const agent = new BskyAgent({
      service: bskyEndpoint,
    });

    // resume session
    const sessionRes = await agent.resumeSession(postSettings.bluesky?.data?.sessionData!);
    const did = sessionRes?.data?.did;

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

    const resize = async (file: File, max: number): Promise<ArrayBuffer | null> => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx == null) {
        return null;
      }

      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise(r => img.onload = r);
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const scale = Math.min(max / img.width, max / img.height);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL(file.type);
      const arr2 = await fetch(dataUrl).then(r => r.blob()).then(r => r.arrayBuffer());
      return arr2;
    }

    const MAX_SIZE = 1000000;
    const embedImages = await (async () => {
      const images = [];
      for (const image of imageDataURLs) {
        const file = await url2File(image, 'image');

        const { width, height } = await getWidHei(image);
        let zoomRate = MAX_SIZE / file.size;
        zoomRate = Math.sqrt(zoomRate)

        let resizedArr = await resize(file, width * zoomRate);
        if (resizedArr == null) {
          continue;
        }

        if (resizedArr.byteLength > MAX_SIZE) {
          resizedArr = await resize(file, width * zoomRate * 0.9);
          if (resizedArr == null) {
            continue;
          }
        }

        if (resizedArr.byteLength > MAX_SIZE) {
          resizedArr = await resize(file, width * zoomRate * 0.7);
          if (resizedArr == null) {
            continue;
          }
        }

        const dataArray: Uint8Array = new Uint8Array(resizedArr);
        const { data: result } = await agent.uploadBlob(
          dataArray,
          {
            encoding: file.type,
          }
        );

  
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
        // const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(imageUrl)}`);

        const fetchImageUrl = `${Config.API_ENDPOINT}/fetch_image?url=${encodeURIComponent(imageUrl)}`;
        const res = await fetch(fetchImageUrl);

        const dataURI = await res.text();
        const [head, image] = dataURI.split(',');

        const parts = head.split(/[:;]/);
        const imageContentType = parts?.[1] ?? 'image/jpeg';

        // base64文字列をデコード
        const byteString = atob(image);
        // デコードされた文字列をUint8Arrayに変換
        const imageData = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) {
          imageData[i] = byteString.charCodeAt(i);
        }
        
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


    const reply: ReplyRef | undefined = await (async () => {
      if ((reply_to_id?.length ?? 0) <= 0) {
        return undefined;
      }

      const uri = `at://${did}/app.bsky.feed.post/${reply_to_id}`;

      const r = await agent.getPostThread({ uri });

      const th = r?.data?.thread as any;
      
      const cid = th?.post?.cid;
      const parent = { 
        uri, 
        cid
      };

      const root = th?.post?.record?.reply?.root ?? parent;

      return {
        root,
        parent
      }
    })();
    

    const postRecord = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      embed: embedImages ?? embedOgp,
      reply
    };


    // const res = await agent.getAuthorFeed({ actor: did });
    // console.log(`FIXME h_oku 後で消す  -> postToBluesky -> res:`, res);
    
     
    const reso = await agent.post(postRecord);       
    console.log(`FIXME h_oku 後で消す  -> postToBluesky -> reso:`);
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

const postToTwritter = async (text: string, images: string[], reply_to_id: string): Promise<boolean> => {
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
      body: JSON.stringify({ token, text, images: imgs, reply_to_id }),
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
