import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // ffmpeg-static and ffprobe-static ship real binaries. Bundling them breaks
  // the spawn path, so they stay external in the server build.
  serverExternalPackages: ['ffmpeg-static', 'ffprobe-static', 'fluent-ffmpeg'],
  experimental: {
    // Uploads go straight to disk; the default 1MB body limit is for JSON.
    serverActions: { bodySizeLimit: '512mb' },
  },
};

export default config;
