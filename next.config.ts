import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up past the repo, finds the lockfile in the
  // home directory and infers the wrong project root -- which breaks chunk
  // serving and leaves the client unhydrated.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
