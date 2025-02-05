import * as v from "@badrap/valita";
import { Context as OakContext, Status } from "@oak/oak";

export type APIResponseType = unknown & object;

export class APIError extends Error {
  constructor(
    public status: Status,
    message: string,
    public extra?: unknown & object,
  ) {
    super(message);
  }
}

interface TypedJsonHandlerOptions<
  QuerySchema extends v.AbstractType | undefined = undefined,
  BodySchema extends v.AbstractType | undefined = undefined,
> {
  query?: QuerySchema;
  body?: BodySchema;
}
interface TypedJsonHandlerInput<
  QuerySchema extends v.AbstractType | undefined = undefined,
  BodySchema extends v.AbstractType | undefined = undefined,
> {
  query: QuerySchema extends v.AbstractType<infer Output> ? Output : undefined;
  body: BodySchema extends v.AbstractType<infer Output> ? Output : undefined;
}
type TypedJsonHandlerCallback<
  Context,
  QuerySchema extends v.AbstractType | undefined = undefined,
  BodySchema extends v.AbstractType | undefined = undefined,
> = (
  ctx: Context,
  input: TypedJsonHandlerInput<QuerySchema, BodySchema>,
) => APIResponseType | Promise<APIResponseType>;

export function apiHandler<
  Context extends OakContext,
  QuerySchema extends v.AbstractType | undefined = undefined,
  BodySchema extends v.AbstractType | undefined = undefined,
>(
  opts: TypedJsonHandlerOptions<QuerySchema, BodySchema>,
  callback: TypedJsonHandlerCallback<Context, QuerySchema, BodySchema>,
): (ctx: Context) => Promise<void> {
  return async ctx => {
    try {
      const input: Partial<TypedJsonHandlerInput<QuerySchema, BodySchema>> = {};

      if (opts.query) {
        try {
          const query = ctx.request.url.searchParams.entries().pipe(Object.fromEntries);
          input.query = (opts.query as QuerySchema & v.Type).parse(query);
        } catch (err) {
          if (err instanceof v.ValitaError) {
            throw new APIError(
              Status.BadRequest,
              `error parsing query parameters: ${err.message}`,
              {
                issues: err.issues.map(it =>
                  it.path.length ? `${it.path.join("/")}: ${it.code}` : it.code,
                ),
              },
            );
          } else throw err;
        }
      }

      if (opts.body) {
        try {
          const body = await ctx.request.body
            .text()
            .then(t => (t ? JSON.parse(t) : {}))
            .catch(() =>
              Promise.reject(new APIError(Status.BadRequest, "body was not JSON-encoded")),
            );
          input.body = (opts.body as BodySchema & v.Type).parse(body);
        } catch (err) {
          if (err instanceof v.ValitaError) {
            throw new APIError(
              Status.BadRequest,
              `error parsing request body: ${err.message}`,
              {
                issues: err.issues.map(it =>
                  it.path.length ? `${it.path.join(".")}: ${it.code}` : it.code,
                ),
              },
            );
          } else throw err;
        }
      }

      const response = await callback(
        ctx,
        input as TypedJsonHandlerInput<QuerySchema, BodySchema>,
      );
      ctx.response.body = JSON.stringify(response);
      ctx.response.type = "application/json";
    } catch (err) {
      if (err instanceof APIError) {
        ctx.response.status = err.status;
        ctx.response.body = JSON.stringify({ ...err.extra, error: err.message });
        ctx.response.type = "application/json";
      } else throw err;
    }
  };
}
