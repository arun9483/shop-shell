# One image per server (FES or mock backend), built from its `pnpm deploy` folder: its compiled code,
# its production dependencies and, for the FES, the built client. Settings come from Cloud Run's
# environment; nothing here is specific to an environment.
FROM node:24.22.1-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node . .
USER node
# Cloud Run sets PORT; the servers read it.
CMD ["node", "--enable-source-maps", "--import", "newrelic/esm-loader.mjs", "-r", "newrelic", "dist/index.js"]
