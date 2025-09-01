import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshToken1746540763137 implements MigrationInterface {
  name = 'AddRefreshToken1746540763137';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "FK_order_creator"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "refreshToken" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ALTER COLUMN "pledgeMap" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_b4a453bc5f19e415c3e62fa8122" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "FK_b4a453bc5f19e415c3e62fa8122"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ALTER COLUMN "pledgeMap" SET DEFAULT '{}'`,
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "refreshToken"`);
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_order_creator" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
