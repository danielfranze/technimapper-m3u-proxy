# Use a lightweight Node.js image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy dependency files first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies to keep the image size small
RUN npm install --production

# Copy the rest of the application source code
COPY . .

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]