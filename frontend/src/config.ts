export type ConfigType = {
  API_ENDPOINT: string,
  post_targets: {
    mastodon: {
      name: string,
      server: string,
      client_id: string,
    }[],
    twitter: {
      redirect_uri: string,
    },
  },
}

export const Config = ((): ConfigType => {
  const mastodon = [
    import.meta.env.VITE_MASTODON_SERVER01,
    import.meta.env.VITE_MASTODON_SERVER02,
    import.meta.env.VITE_MASTODON_SERVER03,
  ]
  .filter(x => x?.length > 0)
  .map(str => {
    const [name, server, client_id] = `${str}`.split(' ');
    return { name, server, client_id };
  })
  ;
  console.log(mastodon);
  return {
    API_ENDPOINT: import.meta.env.VITE_API_ENDPOINT,
    post_targets: {
      mastodon,
      twitter: {
        redirect_uri: import.meta.env.VITE_TWITTER_REDIRECT_URL,
      }
    }
  };
})();
console.log(Config);

// const config_dev: ConfigType = {
//   API_ENDPOINT: import.meta.env.VITE_API_ENDPOINT,

//   post_targets: {
//     mastodon: [
//       {
//         name: 'Mastodon.cloud(dev)',
//         server: 'mastodon.cloud',
//         client_id: '7bh_j5Du2o0WVWcv_vyMf-MVwZuIOHWJBXw0zq6Owis',
//       },
//       {
//         name: 'mstdn.jp(dev)',
//         server: 'mstdn.jp',
//         client_id: 'gIAagB7-8KP6XEW1xHW3Wh3UjOH9A-ircwMlZX-80xw',
//       }
//     ],
//     twitter: {
//       redirect_uri: import.meta.env.VITE_TWITTER_REDIRECT_URL,
//     }
//   }
// }

// // const config_prod = {
// //   // CLIENT_ID: 'UBWPEWEM3L1XHICEZ0TJWOHFQ3QZ0KC3XZPHUXRRVWL044ZU',
// //   API_ENDPOINT: `https://pppost-api.netlify.app/.netlify/functions`,

// //   post_targets: {
// //     mastodon: {
// //       mastodon_cloud: {
// //         name: 'Mastodon.cloud',
// //         server: 'mastodon.cloud',
// //         client_id: '7bh_j5Du2o0WVWcv_vyMf-MVwZuIOHWJBXw0zq6Owis',
// //       },
// //       mstdn_jp: {
// //         name: 'mstdn.jp',
// //         server: 'mstdn.jp',
// //         client_id: 'gIAagB7-8KP6XEW1xHW3Wh3UjOH9A-ircwMlZX-80xw',
// //       }
// //     }, 
// //     twitter: {
// //       // client_id: 'd3BDRmpIaTQ0LXBXZzhDR3FsZXU6MTpjaQ',
// //       redirect_uri: 'https://amay077.github.io/pppost',
// //     }
// //   }}

// // export const Config = import.meta.env.MODE == 'production' ? config_prod : config_dev;
// // export const Config = config_dev;