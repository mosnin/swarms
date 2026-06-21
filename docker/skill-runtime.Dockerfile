# Hermes Cloud — skill runtime image (the SANDBOX_IMAGE the container sandbox runs).
#
# A minimal, non-root base for executing a skill bundle inside the hardened
# container created by DockerSandboxProvider (no network, read-only root, tmpfs
# /work, dropped caps). Keep this image small and dependency-free; the sandbox
# mounts the skill bundle into /work at run time.
FROM node:20-alpine
RUN addgroup -g 65534 -S nobodyx 2>/dev/null || true
WORKDIR /work
USER 65534:65534
# The sandbox provides the command to run (e.g. `node /work/entry.js`).
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["echo 'hermes skill-runtime ready'"]
