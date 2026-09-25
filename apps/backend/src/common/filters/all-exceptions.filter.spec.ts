import { ArgumentsHost, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

function host() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const h = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/x', method: 'GET' }),
    }),
  } as unknown as ArgumentsHost;
  return { h, status, json };
}

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test', meta });

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

  it('keeps HttpException status and message in a consistent envelope', () => {
    const { h, status, json } = host();
    filter.catch(new ForbiddenException('Nope'), h);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        error: 'FORBIDDEN',
        message: 'Nope',
        path: '/api/x',
        timestamp: expect.any(String),
      }),
    );
  });

  it.each([
    ['P2002', 409, /already exists/],
    ['P2025', 404, /not found/],
    ['P2003', 400, /does not exist/],
  ])('maps Prisma %s to %i', (code, expected, message) => {
    expect(filter.resolve(prismaError(code, { target: ['email'] }))).toEqual({
      status: expected,
      message: expect.stringMatching(message),
    });
  });

  it('hides details of unexpected errors behind a 500', () => {
    const { h, status, json } = host();
    filter.catch(new Error('secret connection string leaked'), h);
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('secret');
    expect(filter.resolve(prismaError('P9999')).status).toBe(500);
  });
});
