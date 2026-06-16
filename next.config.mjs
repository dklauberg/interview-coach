/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // mammoth / unpdf are heavy server-only libs used by the resume parser.
  // Keep them external so the bundler doesn't try to bundle their internals.
  serverExternalPackages: ["mammoth", "unpdf"],
};

export default nextConfig;
