import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Books, films and YouTube merged into one section. These three routes are
   * years of bookmarks, pinned tabs and `g b` muscle memory — redirecting is
   * cheaper than breaking them, and permanent so browsers stop asking.
   */
  async redirects() {
    return [
      { source: "/books", destination: "/consumption/books", permanent: true },
      { source: "/watch", destination: "/consumption/films", permanent: true },
      { source: "/youtube", destination: "/consumption/youtube", permanent: true },
      // Tahajjud had its own page for a day before it became a tab on Salah.
      { source: "/tahajjud", destination: "/salah?view=tahajjud", permanent: false },
    ];
  },
};

export default nextConfig;
