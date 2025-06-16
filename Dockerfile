# Step 1: Build the app
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the SvelteKit app
RUN npm run build

# Step 2: Run the app with a lightweight image
FROM node:20-alpine

WORKDIR /app

# Copy only the built app and necessary files
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Default port (you can change if needed)
ENV PORT=3000

# Start the app
CMD ["npm", "start"]
