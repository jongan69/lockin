/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: "build",
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        http2: false,
        'mock-aws-s3': false,
        'aws-sdk': false,
        'nock': false,
        path: false,
        os: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        zlib: require.resolve('browserify-zlib'),
      };
    }
    return config;
  },
};

module.exports = nextConfig;
