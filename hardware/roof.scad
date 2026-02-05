$fn = 80;

// --- Copied Parameters from Base (Required for alignment) ---
wall_thickness = 3;
west_wall_x = -87.5; 
east_wall_x = 75.5 + wall_thickness; 
north_wall_y = 85; 

// Lid Specifics
lid_thickness = 3;
lid_screw_hole_d = 3.2; 
lid_clearance = 0.2; // Tolerance gap so it fits into the base easily

module roof_lid_only() {
    difference() {
        union() {
            // 1. MAIN TOP PLATE (Matches the outer footprint)
            hull() {
                translate([west_wall_x, -75, 0]) cylinder(r=5, h=lid_thickness);
                translate([east_wall_x, -75, 0]) cylinder(r=5, h=lid_thickness); 
                translate([east_wall_x, north_wall_y, 0]) cylinder(r=5, h=lid_thickness);  
                translate([west_wall_x, north_wall_y, 0]) cylinder(r=5, h=lid_thickness); 
            }
            
            // 2. INTERNAL ALIGNMENT RIM (Fits inside the walls)
            // This prevents the lid from sliding around.
            translate([0, 0, -lid_thickness])
            hull() {
                translate([west_wall_x + wall_thickness + lid_clearance, -75 + wall_thickness + lid_clearance, 0]) 
                    cylinder(r=5, h=lid_thickness);
                translate([east_wall_x - wall_thickness - lid_clearance, -75 + wall_thickness - lid_clearance, 0]) 
                    cylinder(r=5, h=lid_thickness); 
                translate([east_wall_x - wall_thickness - lid_clearance, north_wall_y - wall_thickness - lid_clearance, 0]) 
                    cylinder(r=5, h=lid_thickness);  
                translate([west_wall_x + wall_thickness + lid_clearance, north_wall_y - wall_thickness - lid_clearance, 0]) 
                    cylinder(r=5, h=lid_thickness); 
            }
        }

        // 3. SCREW HOLES (Aligned with the posts)
        lid_post_positions = [
            [west_wall_x + wall_thickness, -75 + wall_thickness],
            [east_wall_x - wall_thickness, -75 + wall_thickness],
            [east_wall_x - wall_thickness, north_wall_y - wall_thickness],
            [west_wall_x + wall_thickness, north_wall_y - wall_thickness]
        ];

        for (pos = lid_post_positions) {
            translate([pos[0], pos[1], -lid_thickness - 1]) {
                // Through hole
                cylinder(d=lid_screw_hole_d, h=lid_thickness * 3);
                
                // Countersink for flush screw heads
                translate([0,0, lid_thickness + 0.5])
                    cylinder(d=6.5, h=lid_thickness);
            }
        }
    }
}

// Call the module to render
roof_lid_only();