/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The control plane must never bundle the worker/sandbox runtime.
  // Keep server-only packages external to the client bundle.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
