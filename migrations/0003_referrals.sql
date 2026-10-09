ALTER TABLE user ADD COLUMN referrerId TEXT REFERENCES user(id);
CREATE TABLE referral_code (user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id), code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE referral (invitee_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id), inviter_id TEXT NOT NULL REFERENCES user(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','qualified','rewarded','ineligible')), created_at INTEGER NOT NULL, qualified_at INTEGER, rewarded_at INTEGER, reason TEXT, CHECK(invitee_id <> inviter_id));
CREATE INDEX referral_inviter ON referral(inviter_id, created_at DESC);
CREATE TABLE referral_wechat_identity (identity_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES user(id), created_at INTEGER NOT NULL);
CREATE TRIGGER referral_on_registration AFTER INSERT ON user WHEN NEW.referrerId IS NOT NULL AND NEW.referrerId <> NEW.id BEGIN INSERT INTO referral (invitee_id, inviter_id, created_at) SELECT NEW.id, NEW.referrerId, NEW.createdAt WHERE EXISTS (SELECT 1 FROM referral_code WHERE user_id = NEW.referrerId); END;
CREATE TRIGGER referral_no_reassignment BEFORE UPDATE OF referrerId ON user WHEN OLD.referrerId IS NOT NEW.referrerId BEGIN SELECT RAISE(ABORT, 'referral attribution is immutable'); END;
