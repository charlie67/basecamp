import 'leaflet';

declare module 'proj4leaflet';

declare module 'leaflet' {
    namespace Proj {
        class CRS extends L.CRS {
            constructor(
                srsCode: string,
                proj4def: unknown,
                options?: {resolutions?: number[]; origin?: [number, number]},
            );
        }
    }
}
