/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // imagem Docker enxuta (node server.js)
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
          // Selo RTA: permite que filtros de controle parental bloqueiem o site
          { key: 'Rating', value: 'RTA-5042-1996-1400-1577-RTA' },
        ],
      },
    ];
  },
};

export default nextConfig;
