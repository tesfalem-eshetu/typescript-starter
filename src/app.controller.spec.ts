import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    appController = moduleRef.get(AppController);
  });

  describe('GET /', () => {
    it('renders an HTML landing page that points at Swagger UI', () => {
      const html = appController.getLanding();

      expect(html).toContain('<title>Events API</title>');
      expect(html).toContain('href="/api"');
      expect(html).toContain('Swagger');
    });

    it('lists every public REST endpoint', () => {
      const html = appController.getLanding();

      expect(html).toContain('POST /users');
      expect(html).toContain('GET /users/:id');
      expect(html).toContain('POST /events');
      expect(html).toContain('GET /events/:id');
      expect(html).toContain('DELETE /events/:id');
      expect(html).toContain('POST /users/:userId/events/merge');
    });
  });
});
