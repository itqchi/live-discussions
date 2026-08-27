ALTER TABLE house_member
  DROP CONSTRAINT IF EXISTS house_member_role_check;

ALTER TABLE house_member
  ADD CONSTRAINT house_member_role_check
  CHECK (role IN ('owner', 'admin', 'member'));
