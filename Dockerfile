# Emberfall: static HTML5 game served by nginx.
# Pinned to linux/amd64 because the image ships to AMD64 hosts; this holds
# even when building on an ARM machine (e.g. Apple Silicon).
FROM --platform=linux/amd64 nginx:1.30-alpine

# Install Alpine security fixes that are newer than the nginx base image, so
# a slow upstream rebuild doesn't hold releases at the Trivy gate, and clear
# the default site.
RUN apk upgrade --no-cache \
    && rm -rf /usr/share/nginx/html/*

# Only game files are copied, so .env, CodeSamples/ and .git never end up in
# the image.
COPY index.html /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80

# Shell form on purpose: `|| exit 1` maps any wget error to Docker's "unhealthy".
# hadolint ignore=DL3025
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

# nginx in the foreground keeps the container alive and serves the game.
CMD ["nginx", "-g", "daemon off;"]
