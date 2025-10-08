## Project overview

This project is a 4D (3D+time) scientific data viewer for the browser, focused on data from fluorescent microscopy.

It reads sequences of 3D .tif files and views them as 3D movies, with "free roaming" in space and proper control of time (start, stop, choose timestep via slides, etc).

It must be blazingly fast, being as real time as possible, and for that it needs to leverage the GPU as much as possible.

Rendering is based on Direct Volume Rendering (DVR), using 3D textures and GPU ray-marching

## What can you expect from the data?

- Typical volumes are of shape [T,Z,Y,X] = [100,200,500,500], and can be greyscale 8bit (0-255), RGB or float
- The data is mostly bright shapes and a dark background, and I want to see "through " the background. Real time transparency/transfer function tuning is a must.

## Code guidelines

- This project is written in threejs and fully using WebGPU
- Data visualization should be as fast/efficient as possible, making full use of the GPUs
- When data is loaded, there is a preprocessing step before going to the data visualization. This preprocessing step's goal is to precompute/format stuff as much as possible in order to make the subsequent visualization stage as fast as possible. The preprocessing stage can take as much time as needed.
- The preprocessing stage can be done in (or have parts in) Python (with uv package manager)
- Record your progress, status, etc, in a PROGRESS.md file.
- Do all the testing necessary to ensure the code is working correctly
- If I ask you to do something, do it, do it properly, do not save energy or be lazy or do half-implementations
- Make your code understandable to readers/humans. I will be manually checking it periodically
