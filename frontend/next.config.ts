import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "192.168.137.206",
    "*.ngrok-free.app",
    "*.ngrok.io",
  ],
};

export default nextConfig;
