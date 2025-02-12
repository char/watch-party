# watch-party 2

watch-party, four years later, with a (soon-to-be) fancier frontend

powered by [aftercare](https://github.com/char/aftercare) and [oak](https://jsr.io/@oak/oak).

## setup

```shell
$ deno run -A ./_patch-valita.ts # grab patched valita from JSR
$ deno task start # builds the client and runs the server
Listening on: http://…
$ deno task dev # watches the client and runs the server in watch mode
Listening on: http://…
```

## todo

- peer list above chat
- periodic playhead reporting, debug overview where you can view everyone's timestamp
- chat formatting
- playlist manipulation
- seamless reconnection when websocket drops
