/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "epeac.com.br"
      }
    ]
  }
};

export default nextConfig;
