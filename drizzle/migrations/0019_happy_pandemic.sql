CREATE TABLE IF NOT EXISTS "artist_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid,
	"year_month" text NOT NULL,
	"item_type" text NOT NULL,
	"location" text NOT NULL,
	"gross_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"refund_cents" integer DEFAULT 0 NOT NULL,
	"net_cents" integer DEFAULT 0 NOT NULL,
	"commission_cents" integer DEFAULT 0 NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_earnings_item_type_valid" CHECK ("commission_earnings"."item_type" IN ('acrylic', 'prints', 'other')),
	CONSTRAINT "commission_earnings_location_valid" CHECK ("commission_earnings"."location" IN ('online', 'mobile'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"year_month" text NOT NULL,
	"item_type" text NOT NULL,
	"override_commission_cents" integer NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_overrides_cell_unique" UNIQUE("artist_id","year_month","item_type"),
	CONSTRAINT "commission_overrides_item_type_valid" CHECK ("commission_overrides"."item_type" IN ('acrylic', 'prints', 'other'))
);
--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "payable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artist_payouts" ADD CONSTRAINT "artist_payouts_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commission_earnings" ADD CONSTRAINT "commission_earnings_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commission_overrides" ADD CONSTRAINT "commission_overrides_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_payouts_artist_idx" ON "artist_payouts" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_earnings_artist_month_idx" ON "commission_earnings" USING btree ("artist_id","year_month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_earnings_month_idx" ON "commission_earnings" USING btree ("year_month");