# Contractor Attendance App

A lightweight web application for recording and managing contractor attendance.
The app allows contractors to log their attendance without requiring login, while managers can view and manage records through a shared Excel file.

## Features

* No login required for contractors
* Simple attendance sign-in interface
* Records stored in Excel file
* Shared access for managers
* Real-time attendance logging
* Easy deployment and local development
* Built with React / Next.js

## How It Works

1. Contractors open the web app
2. Enter required attendance details
3. Submit attendance
4. App writes entry to shared Excel file
5. Managers access the Excel file to review attendance

## Tech Stack

* React / Next.js
* Node.js
* Excel file storage
* Microsoft Graph API (optional / server-side)
* REST API routes

## Project Structure

```
/app            → UI pages
/api            → API endpoints
/scripts        → setup scripts
/lib            → Excel / data handling
.env.local      → environment variables
```

## Clone and Run the Project

Since `node_modules` is not included in this repository, you must install dependencies after cloning.

### 1. Clone the repository

```bash
git clone https://github.com/AarzooDhiman/Contractor_attendance.git
```

### 2. Navigate into the project

```bash
cd Contractor_attendance
```

### 3. Install dependencies

This will install all required packages from `package.json`.

```bash
npm install
```

### 4. Create environment file

Copy the example file:

```bash
cp .env.local.example .env.local
```

Then update values inside `.env.local` as required.

### 5. Run setup script (creates Excel file)

```bash
node scripts/setup-excel.js
```

### 6. Start development server

```bash
npm run dev
```

### 7. Open the app

Open in browser:

```
http://localhost:3000
```

---

## Requirements

Make sure the following are installed:

* Node.js (v18 or later recommended)
* npm (comes with Node.js)
* Git

Check versions:

```bash
node -v
npm -v
git --version
```


## Getting Started

Install dependencies:

```
npm install
```

Run setup script:

```
node scripts/setup-excel.js
```

Start development server:

```
npm run dev
```

Open in browser:

```
http://localhost:3000
```

## Usage

### Contractor

* Open the app
* Enter attendance details
* Submit

### Manager

* Open shared Excel file
* View attendance records
* Export or analyze data

## Future Improvements

* Manager dashboard
* Engineer Attendance with Microsoft Login
* Attendance filtering
* Export to CSV
* Date range reports
* Contractor list management
* Mobile UI improvements


