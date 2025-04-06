Is This a Scam Call?
====================

A project to help users identify and report scam phone numbers using live metadata enrichment and user-submitted reports.

Project Structure
-----------------

::

  isthisascamcall/
  ├── frontend/         # Vite + TypeScript app
  ├── backend/          # Java phone metadata REST service
  │   ├── lib/          # Local .jar dependencies (not committed to Git)
  │   ├── log/          # Logs from backend service
  │   └── PhoneMetadataService.java
  ├── data/             # (Optional) Shared data like JSON or CSV

Requirements
------------

Node.js + NPM (for frontend)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^
- Node.js version 18 or higher
- npm (comes with Node)

Download from: https://nodejs.org/

Java (for backend)
^^^^^^^^^^^^^^^^^^
- Java Development Kit (JDK) 17 or higher

Download from: https://adoptium.net/en-GB/temurin/releases

Setup Instructions
------------------

Frontend (Vite App)
^^^^^^^^^^^^^^^^^^^

1. Open a terminal and navigate to the frontend directory::

     cd frontend

2. Install dependencies::

     npm install

3. Start the development server::

     npm run dev

Visit the app at: http://localhost:5173

Backend (Java Metadata Service)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

1. Create a `lib/` folder inside `backend/` and download the following `.jar` files into it:

   - `libphonenumber-x.y.z.jar`: https://github.com/google/libphonenumber/releases
   - `json-20231013.jar`: https://repo1.maven.org/maven2/org/json/json/20231013/

2. Compile and run the service::

     cd backend
     javac -cp ".:lib/*" PhoneMetadataService.java
     java -cp ".:lib/*" PhoneMetadataService

   (Note for Windows: replace `:` with `;` in the classpath, e.g., `. ; lib/*`)

3. The service runs at::

     http://localhost:8080/lookup?number=+14155552671

4. Logs are written to::

     backend/log/service.log

Security Notes
--------------

- The backend validates all inputs to prevent abuse
- An in-memory LRU cache stores the 500 most recent lookups
- No sensitive data is stored or exposed
- Logs are only kept locally for debugging

Future Enhancements
-------------------

- Dockerized backend build
- User-submitted reports
- Scam rating system
- Internationalization

License
-------

This project is open source under the MIT License.
