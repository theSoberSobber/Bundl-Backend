import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserAndOrderTables1683500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user table
    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phoneNumber" character varying NOT NULL,
        "fcmToken" character varying,
        "credits" integer NOT NULL DEFAULT 5,
        CONSTRAINT "PK_user_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_phoneNumber" UNIQUE ("phoneNumber")
      )
    `);

    // Create order table with enum
    await queryRunner.query(`
      CREATE TYPE "public"."order_status_enum" AS ENUM('ACTIVE', 'EXPIRED', 'COMPLETED')
    `);

    await queryRunner.query(`
      CREATE TABLE "order" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "status" "order_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "creatorId" uuid NOT NULL,
        "amountNeeded" decimal(10,2) NOT NULL,
        "pledgeMap" jsonb NOT NULL DEFAULT '{}',
        "totalPledge" decimal(10,2) NOT NULL DEFAULT 0,
        "totalUsers" integer NOT NULL DEFAULT 0,
        "platform" character varying NOT NULL,
        "latitude" decimal(10,6) NOT NULL,
        "longitude" decimal(10,6) NOT NULL,
        CONSTRAINT "PK_order_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_creator" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // Add uuid-ossp extension if not exists
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order"`);
    await queryRunner.query(`DROP TYPE "public"."order_status_enum"`);
    await queryRunner.query(`DROP TABLE "user"`);
  }
} 