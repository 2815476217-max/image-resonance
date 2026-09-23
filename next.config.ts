import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.EXHIBITION_BUILD_DIR || '.next',
  devIndicators: false,
  async headers() {
    return [{source:'/upload',headers:[
      {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
      {key:'Cross-Origin-Embedder-Policy',value:'require-corp'},
    ]}];
  },
};
export default config;
