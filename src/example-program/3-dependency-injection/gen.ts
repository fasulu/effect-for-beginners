import { Context, Effect, Either, pipe } from "effect";
import * as Schema from "@effect/schema/Schema";
import { ParseError } from "@effect/schema/ParseResult";

const pokemonSchema = Schema.struct({
  name: Schema.string,
  weight: Schema.number,
});

type Pokemon = Schema.To<typeof pokemonSchema>;
const parsePokemon = Schema.parse(pokemonSchema);

class FetchError {
  readonly _tag = "FetchError";
}

class JSONError {
  readonly _tag = "JSONError";
}

class SameWeightError {
  readonly _tag = "SameWeightError";
  constructor(readonly weight: number) {}
}

interface PokemonClient {
  _tag: "PokemonClient";
  getById(
    id: number
  ): Effect.Effect<never, FetchError | JSONError | ParseError, Pokemon>;
}
const PokemonClient = Context.Tag<PokemonClient>("@app/PokemonClient");

// const getPokemon = (id: number) =>
//   pipe(
//     PokemonClient,
//     Effect.flatMap((client) => client.getById(id)),
//     Effect.catchAll(() => Effect.succeed({ name: "default", weight: 0 }))
//   );

const getPokemon = (id: number) =>
  Effect.gen(function* (_) {
    const client = yield* _(PokemonClient);
    return yield* _(client.getById(id));
  }).pipe(
    Effect.catchAll(() => Effect.succeed({ name: "default", weight: 0 }))
  );

const formatPokemon = (pokemon: Pokemon) =>
  `${pokemon.name} weighs ${pokemon.weight} hectograms`;

const getRandomNumberArray = Effect.all(
  Array.from({ length: 10 }, () =>
    Effect.sync(() => Math.floor(Math.random() * 100) + 1)
  )
);

const calculateHeaviestPokemon = (pokemons: Pokemon[]) =>
  Effect.reduce(pokemons, 0, (highest, pokemon) =>
    pokemon.weight === highest
      ? Effect.fail(new SameWeightError(pokemon.weight))
      : Effect.succeed(pokemon.weight > highest ? pokemon.weight : highest)
  );

// const program = pipe(
//   getRandomNumberArray,
//   Effect.flatMap((arr) => Effect.all(arr.map(getPokemon))),
//   Effect.tap((pokemons) =>
//     Effect.log("\n" + pokemons.map(formatPokemon).join("\n"))
//   ),
//   Effect.flatMap((pokemons) => calculateHeaviestPokemon(pokemons)),
//   Effect.catchTag("SameWeightError", (e) =>
//     Effect.log(`Two pokemon have the same weight: ${e.weight}`)
//   ),
//   Effect.flatMap((heaviest) =>
//     Effect.log(`The heaviest pokemon weighs ${heaviest} hectograms!`)
//   )
// );

const program = Effect.gen(function* (_) {
  const arr = yield* _(getRandomNumberArray);
  yield* _(Effect.log("Time of fetch process started"));
  const pokemons = yield* _(Effect.all(arr.map(getPokemon)));
  yield* _(Effect.log("Time of fetch process ended"));
  yield* _(Effect.log("\n" + pokemons.map(formatPokemon).join("\n")));

  const heaviestResult = yield* _(
    Effect.either(calculateHeaviestPokemon(pokemons))
  );

  if (Either.isLeft(heaviestResult)) {
    yield* _(
      Effect.log(
        `Two pokemon have the same weight: ${heaviestResult.left.weight}`
      )
    );
  } else {
    yield* _(
      Effect.log(
        `The heaviest pokemon weighs ${heaviestResult.right} hectograms!`
      )
    );
  }
});

program.pipe(
  Effect.provideService(PokemonClient, {
    _tag: "PokemonClient",
    getById: (id) =>
      pipe(
        Effect.tryPromise({
          try: () => fetch(`https://pokeapi.co/api/v2/pokemon/${id}`),
          catch: () => new FetchError(),
        }),
        Effect.flatMap((response) =>
          Effect.tryPromise({
            try: () => response.json(),
            catch: () => new JSONError(),
          })
        ),
        Effect.flatMap((x) => parsePokemon(x)),
        Effect.catchAll(() => Effect.succeed({ name: "default", weight: 0 }))
      ),
  }),
  Effect.runPromise
);
