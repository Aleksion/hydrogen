import React, {ReactElement, useMemo} from 'react';
import {matchPath} from '../../utilities/match_path';

export type ImportGlobEagerOutput = Record<string, Record<'default', any>>;

/**
 * Build a set of default Hydrogen routes based on the output provided by Vite's
 * import.meta.globEager method.
 *
 * @see https://vitejs.dev/guide/features.html#glob-import
 */
export function DefaultRoutes({
  location,
  pages,
  serverState,
  fallback,
}: {
  location: Location;
  pages: ImportGlobEagerOutput;
  serverState: Record<string, any>;
  fallback?: ReactElement;
}) {
  const basePath = '/';

  const routes = useMemo(
    () => createRoutesFromPages(pages, basePath),
    [pages, basePath]
  );

  let foundRoute, foundRouteDetails;

  for (let i = 0; i < routes.length; i++) {
    foundRouteDetails = matchPath(location.pathname, routes[i]);

    if (foundRouteDetails) {
      foundRoute = routes[i];
      break;
    }
  }

  return foundRoute ? (
    <foundRoute.component params={foundRouteDetails.params} {...serverState} />
  ) : (
    fallback
  );
}

interface Location {
  pathname: string;
  searcH: string;
}

interface HydrogenRoute {
  component: any;
  path: string;
  exact: boolean;
}

export function createRoutesFromPages(
  pages: ImportGlobEagerOutput,
  topLevelPath = '*'
): HydrogenRoute[] {
  const topLevelPrefix = topLevelPath.replace('*', '').replace(/\/$/, '');

  const routes = Object.keys(pages).map((key) => {
    const path = key
      .replace('./pages', '')
      .replace(/\.server\.(t|j)sx?$/, '')
      /**
       * Replace /index with /
       */
      .replace(/\/index$/i, '/')
      /**
       * Only lowercase the first letter. This allows the developer to use camelCase
       * dynamic paths while ensuring their standard routes are normalized to lowercase.
       */
      .replace(/\b[A-Z]/, (firstLetter) => firstLetter.toLowerCase())
      /**
       * Convert /[handle].jsx and /[...handle].jsx to /:handle.jsx for react-router-dom
       */
      .replace(
        /\[(?:[.]{3})?(\w+?)\]/g,
        (_match, param: string) => `:${param}`
      );

    /**
     * Catch-all routes [...handle].jsx don't need an exact match
     * https://reactrouter.com/core/api/Route/exact-bool
     */
    const exact = !/\[(?:[.]{3})(\w+?)\]/.test(key);

    return {
      path: topLevelPrefix + path,
      component: pages[key].default,
      exact,
    };
  });

  /**
   * Place static paths BEFORE dynamic paths to grant priority.
   */
  return [
    ...routes.filter((route) => !route.path.includes(':')),
    ...routes.filter((route) => route.path.includes(':')),
  ];
}
