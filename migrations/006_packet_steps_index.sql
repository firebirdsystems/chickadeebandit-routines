-- The caregiver packet share page reads a packet's steps on every view:
-- `WHERE packet_id = ? ORDER BY sort_order`. Without an index that is a scan
-- of every packet's steps, and the hub is about to require an index leading
-- with a shareable feed's fk_column, as it already does for aggregates.
-- (packet_id, sort_order) also hands the rows back already in order.
CREATE INDEX IF NOT EXISTS app_routines__caregiver_packet_steps_packet_idx
  ON app_routines__caregiver_packet_steps (packet_id, sort_order);
