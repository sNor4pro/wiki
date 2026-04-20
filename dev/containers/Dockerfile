# -- DEV DOCKERFILE --
# -- DO NOT USE IN PRODUCTION! --

FROM node:24
LABEL maintainer "requarks.io"

ARG PANDOC_VERSION=3.9.0.2

RUN apt-get update && \
    apt-get install -y bash curl git python3 make g++ nano openssh-server gnupg tar && \
    arch="$(dpkg --print-architecture)" && \
    case "$arch" in \
      amd64) pandoc_arch='amd64' ;; \
      arm64) pandoc_arch='arm64' ;; \
      *) echo "Unsupported pandoc architecture: $arch" && exit 1 ;; \
    esac && \
    curl -fsSL -o /tmp/pandoc.tar.gz "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-${pandoc_arch}.tar.gz" && \
    tar -xzf /tmp/pandoc.tar.gz -C /tmp && \
    cp "/tmp/pandoc-${PANDOC_VERSION}/bin/pandoc" /usr/local/bin/pandoc && \
    chmod +x /usr/local/bin/pandoc && \
    rm -rf /tmp/pandoc* && \
    mkdir -p /wiki

WORKDIR /wiki

ENV dockerdev 1
ENV DEVDB postgres

EXPOSE 3000

CMD ["tail", "-f", "/dev/null"]
