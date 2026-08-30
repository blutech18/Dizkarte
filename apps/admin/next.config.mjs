/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dizkarte/config", "@dizkarte/domain"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    /*
      Client-side router cache window.

      Every protected route is dynamic (authorization reads the session cookie),
      and Next's default stale time for a dynamic route is 0 — so the console
      re-fetched a page from the server even when the operator had just come from
      it. The dominant navigation in this console is queue -> record -> back to
      queue, which meant paying for the same query twice within seconds.

      Why 15 seconds rather than longer: these are shared moderation queues, so a
      second Admin may resolve a case while this Admin is looking at it. A short
      window covers the immediate back-navigation without letting a stale queue
      linger. A mutation made *here* clears the cache regardless — every server
      action calls `revalidatePath` for the list and the record it touched — and a
      stale row can never produce a wrong write, because the privileged RPCs
      re-check authorization and the state machine rejects an invalid transition.

      `static` is deliberately left at its default: no link in the app sets
      `prefetch={true}`, so the `static` value is never consulted.
    */
    staleTimes: {
      dynamic: 15,
    },
  },
};

export default nextConfig;
