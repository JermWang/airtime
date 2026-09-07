-- How a house card's artwork meets its surface. FILL crops to the edges, which
-- is what every card did before this and still does by default; FIT shows all
-- of it, for a logo drawn in a shape the surface does not have.
ALTER TABLE "showcase_creatives" ADD COLUMN "fit" text DEFAULT 'FILL' NOT NULL;
