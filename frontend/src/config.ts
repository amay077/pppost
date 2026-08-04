export type ConfigType = {
  API_ENDPOINT: string,
  post_targets: {
    threads: {
      client_id: string,
      redirect_uri: string,
    },
  },
}

export const Config = ((): ConfigType => {
  return {
    API_ENDPOINT: import.meta.env.VITE_API_ENDPOINT,
    post_targets: {
      threads: {
        client_id: import.meta.env.VITE_THREADS_CLIENT_ID,
        redirect_uri: import.meta.env.VITE_THREADS_REDIRECT_URL,
      },
    }
  };
})();
console.log(Config);

// const config_dev: ConfigType = {
//   API_ENDPOINT: import.meta.env.VITE_API_ENDPOINT,

//   post_targets: {
//     twitter: {
//       redirect_uri: import.meta.env.VITE_TWITTER_REDIRECT_URL,
//     }
//   }
// }

// // const config_prod = {
// //   // CLIENT_ID: 'UBWPEWEM3L1XHICEZ0TJWOHFQ3QZ0KC3XZPHUXRRVWL044ZU',
// //   API_ENDPOINT: `https://pppost-api.netlify.app/.netlify/functions`,

// //   post_targets: {
// //     twitter: {
// //       // client_id: 'd3BDRmpIaTQ0LXBXZzhDR3FsZXU6MTpjaQ',
// //       redirect_uri: 'https://amay077.github.io/pppost',
// //     }
// //   }}

// // export const Config = import.meta.env.MODE == 'production' ? config_prod : config_dev;
// // export const Config = config_dev;