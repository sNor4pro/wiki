# =========================
# --- BUILD NPM MODULES ---
# =========================
FROM node:20-alpine AS build

RUN apk add yarn g++ make cmake python3 --no-cache

WORKDIR /wiki

COPY ./package.json ./package.json
COPY ./patches ./patches

RUN yarn --production --frozen-lockfile --non-interactive --network-timeout 100000
RUN yarn patch-package

# ===============
# --- Release ---
# ===============
FROM node:20-alpine
LABEL maintainer="requarks.io"

ARG PANDOC_VERSION=3.9.0.2

RUN apk add bash curl git openssh gnupg sqlite --no-cache && \
    arch="$(apk --print-arch)" && \
    case "$arch" in \
      x86_64) pandoc_arch='amd64' ;; \
      aarch64) pandoc_arch='arm64' ;; \
      *) echo "Unsupported pandoc architecture: $arch" && exit 1 ;; \
    esac && \
    curl -fsSL -o /tmp/pandoc.tar.gz "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-${pandoc_arch}.tar.gz" && \
    tar -xzf /tmp/pandoc.tar.gz -C /tmp && \
    cp "/tmp/pandoc-${PANDOC_VERSION}/bin/pandoc" /usr/local/bin/pandoc && \
    chmod +x /usr/local/bin/pandoc && \
    rm -rf /tmp/pandoc* && \
    mkdir -p /wiki && \
    mkdir -p /logs && \
    mkdir -p /wiki/data/content && \
    chown -R node:node /wiki /logs

WORKDIR /wiki

COPY --chown=node:node ./build/assets ./assets
COPY --chown=node:node --from=build /wiki/node_modules ./node_modules
COPY --chown=node:node ./server ./server
COPY --chown=node:node ./build/server/views ./server/views
COPY --chown=node:node ./dev/build/config.yml ./config.yml
COPY --chown=node:node ./build/package.json ./package.json
COPY --chown=node:node ./LICENSE ./LICENSE

USER node

VOLUME ["/wiki/data/content"]

EXPOSE 3000
EXPOSE 3443

CMD ["node", "server"]
