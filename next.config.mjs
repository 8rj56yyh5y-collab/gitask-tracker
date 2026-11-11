/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["node:sqlite"],
  // Фото чека уменьшается в телефоне до ~0,5 МБ; запас — на случай большого снимка.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};
export default nextConfig;
