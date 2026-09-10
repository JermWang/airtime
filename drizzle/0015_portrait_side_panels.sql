-- The side panels beside the station picture are portrait displays.
UPDATE placements SET aspect_ratio = '9:16', max_width = 1080, max_height = 1920 WHERE id IN ('PANEL_LEFT', 'PANEL_RIGHT');
