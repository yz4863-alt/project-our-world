# Earth Textures

The close-zoom Earth color textures come from NASA's Blue Marble imagery.

Desktop/high-resolution mode uses eight 4096x4096 tiles generated from NASA's 21600x10800 Blue Marble Next Generation map:

- `earth_tile_r0_c0.jpg`
- `earth_tile_r0_c1.jpg`
- `earth_tile_r0_c2.jpg`
- `earth_tile_r0_c3.jpg`
- `earth_tile_r1_c0.jpg`
- `earth_tile_r1_c1.jpg`
- `earth_tile_r1_c2.jpg`
- `earth_tile_r1_c3.jpg`

`earth_blue_marble_8192.jpg` is kept as a single-texture fallback for smaller screens or lower-capability GPUs.

The supporting normal/specular texture assets come from the official three.js examples repository:

- `earth_normal_2048.jpg`
- `earth_specular_2048.jpg`

Sources:

- NASA Blue Marble: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_8192.png
- NASA Blue Marble Next Generation: https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x21600x10800.jpg
- three.js examples: https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets
