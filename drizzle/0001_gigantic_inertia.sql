CREATE TABLE "worker_heartbeats" (
	"name" varchar(60) PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
