# Use a Node.js base image
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Install frontend dependencies
COPY package*.json ./
RUN npm install

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN npm install --prefix backend

# Copy the rest of the project files
COPY . .

# Build the frontend
RUN npm run build

# Build the backend
RUN npm run build --prefix backend

# Expose the port the app will run on
EXPOSE 5000

# Start the server
CMD ["node", "backend/dist/server.js"]
