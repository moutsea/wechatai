CREATE TABLE user (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
CREATE TABLE session (id TEXT PRIMARY KEY NOT NULL, token TEXT NOT NULL UNIQUE, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, expiresAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
CREATE INDEX session_user ON session(userId);
CREATE TABLE account (id TEXT PRIMARY KEY NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, accountId TEXT NOT NULL, providerId TEXT NOT NULL, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT, password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, UNIQUE(providerId, accountId));
CREATE INDEX account_user ON account(userId);
CREATE TABLE verification (id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
CREATE INDEX verification_identifier ON verification(identifier);
CREATE TABLE payment_customer (user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id), customer_id TEXT NOT NULL UNIQUE);
