# DevMatter

[![Docker Pulls](https://img.shields.io/docker/pulls/adityavinodh/dev-matter)](https://hub.docker.com/r/adityavinodh/dev-matter)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A lightweight, self-hostable platform for managing your applications and automating repetitive development tasks.

## Overview

DevMatter is designed to streamline common development workflows by providing a centralized platform for managing multiple projects. Whether you're juggling several applications or need a simple way to handle form submissions and notifications, DevMatter offers the flexibility and control you need.

## Features

### 📋 Forms
- **Custom Schema Definition**: Create forms with your own schema structure
- **Programmatic Submissions**: Simple API for saving form data
- **Real-time Notifications**: Get notified instantly when submissions occur
- **Mobile-First Experience**: Clean mobile interface for viewing submissions on the go (iOS support, Android coming soon)

### 🚀 More Features Coming Soon
- Team based collaboration
- Project monitoring and analytics
- Third party integrations
- API based customer support system

## Quick Start

### Cloud Hosting
Get started immediately with our hosted version at [devmatter.app](https://devmatter.app)

### Self-Hosting with Docker
```bash
docker run -d \
  --name dev-matter \
  -p 3000:3000 \
  -e DATABASE_URL="your_database_url" \
  -e SECRET="your_secret_key" \
  -e RESEND_API_KEY="your_resend_api_key" \
  -e GOOGLE_APPLICATION_CREDENTIALS="path/to/credentials.json" \
  adityavinodh/dev-matter
```

Note: This is only the API server. The web app has its own repository: [devmatter-web](https://github.com/aditya-vinodh/dev-matter-web)

## Local Development Setup

### Prerequisites
- Node.js 20+ and npm
- PostgreSQL database
- Firebase project for push notifications
- Resend API key for transactional email

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/dev-matter.git
   cd dev-matter
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

4. **Configure your environment**

   Edit `.env` with your configuration:

   ```bash
   # Required
   DATABASE_URL=postgresql://username:password@localhost:5432/devmatter
   SECRET=your-super-secret-key-here
   RESEND_API_KEY=your-resend-api-key
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-admin-sdk.json
   ```

5. **Set up the database**
   ```bash
   npm run db:push
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SECRET` | ✅ | Secret key for JWT tokens and encryption |
| `RESEND_API_KEY` | ✅ | API key for email notifications via Resend |
| `GOOGLE_APPLICATION_CREDENTIALS` | ✅ | Path to Firebase Admin SDK JSON file for push notifications |

### Firebase Setup
For push notifications, you'll need to:
1. Create a Firebase project
2. Generate a service account key
3. Download the JSON credentials file
4. Set `GOOGLE_APPLICATION_CREDENTIALS` to the file path

## Database Management

```bash
# Generate migrations
npm run db:generate

# Push schema changes to database
npm run db:push

# Run migrations
npm run db:migrate

# Open Drizzle Studio (database GUI)
npm run db:studio
```

## Contributing

We welcome contributions!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 [Contact form](https://devmatter.app/contact)
- 🐛 Issues: [GitHub Issues](https://github.com/aditya-vinodh/dev-matter/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-username/dev-matter/discussions)

---

Built with ❤️ for developers who want to focus on building, not managing.
