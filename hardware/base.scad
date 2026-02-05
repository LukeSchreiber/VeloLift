$fn = 80;

// --- Parameters ---
wall_thickness = 3;
wall_height = 95; // EXTENDED: Changed from 85 to 95
north_wall_y = 85; 

// Lid Mounting
lid_screw_hole_d = 3.2; // 3.2mm for M3.

// USB Hole Parameters
usb_hole_w = 35; 
usb_hole_h = 15;
usb_hole_y = 40; 
usb_hole_z = 20; 

// Retract Reel Specifics
reel_internal_depth = 14; 
reel_floor = 4;
reel_height = reel_internal_depth + reel_floor; 

// --- Positioning Math (RESTORED TO ORIGINAL) ---
west_wall_x = -87.5; 
cradle_x = 44.5;    
cradle_y = 10.0;    
east_wall_x = 75.5 + wall_thickness; 

module super_base_v23_2_extended() {
    
    // 1. THE MAIN SHELL AND WALLS
    difference() {
        hull() {
            translate([west_wall_x, -75, 0]) cylinder(r=5, h=wall_height);
            translate([east_wall_x, -75, 0]) cylinder(r=5, h=wall_height); 
            translate([east_wall_x, north_wall_y, 0]) cylinder(r=5, h=wall_height);  
            translate([west_wall_x, north_wall_y, 0]) cylinder(r=5, h=wall_height); 
        }
        // Inner Hollow
        translate([0, 0, wall_thickness]) 
        hull() {
            translate([west_wall_x + wall_thickness, -75 + wall_thickness, 0]) cylinder(r=5, h=wall_height + 1);
            translate([east_wall_x - wall_thickness, -75 + wall_thickness, 0]) cylinder(r=5, h=wall_height + 1); 
            translate([east_wall_x - wall_thickness, north_wall_y - wall_thickness, 0]) cylinder(r=5, h=wall_height + 1);  
            translate([west_wall_x + wall_thickness, north_wall_y - wall_thickness, 0]) cylinder(r=5, h=wall_height + 1); 
        }
        
        // --- USB HOLE ---
        translate([west_wall_x, usb_hole_y, usb_hole_z])
            cube([wall_thickness * 4, usb_hole_w, usb_hole_h], center=true);
    }

    // 2. THE ENCODER TOWER
    translate([-35, -50, wall_thickness]) 
    rotate([0, 0, 90]) {
        difference() {
            translate([-22.5, -25, 0]) cube([45, 50, 75]); 
            
            // Encoder Cutouts
            translate([-5, 0, 45]) rotate([0, 90, 0]) cylinder(d=38.5, h=36, $fn=100);
            translate([20, 0, 45]) rotate([0, 90, 0]) cylinder(d=21, h=10, center=true);
            
            // Wire channel and screw holes
            translate([-25, -26, 45 - 6]) cube([50, 26, 12]);
            translate([-5, -16, 45]) {
                cylinder(d=3.4, h=75, center=true, $fn=20);
                translate([0, 0, 20]) rotate([0, 0, 30]) cylinder(d=6.2, h=10, center=true, $fn=6);
            }
            
            // Internal Coring
            translate([-22.5 + 3, -25 + 3, -1]) 
                cube([45 - 6, 50 - 6, 23]); 
        }
    }

    // 3. THE FLIPPED RETRACT HOLDER
    translate([cradle_x, cradle_y, wall_thickness]) 
    rotate([0, 0, 180]) { 
        difference() {
            hull() {
                translate([-31, -31, 0]) cylinder(r=4, h=reel_height);
                translate([31, -31, 0]) cylinder(r=4, h=reel_height);
                translate([31, 31, 0]) cylinder(r=4, h=reel_height);
                translate([-31, 31, 0]) cylinder(r=4, h=reel_height);
            }
            translate([0, 0, reel_floor]) cylinder(d=50, h=reel_internal_depth + 5);
            translate([-25, -16, reel_floor]) cube([10, 32, reel_height]);
            translate([11, -14, reel_floor]) cube([24, 28, reel_height]);
            translate([28, 28, -1]) cylinder(d=3.2, h=30);
            translate([-28, 28, -1]) cylinder(d=3.2, h=30);
            translate([28, -28, -1]) cylinder(d=3.2, h=30);
            translate([-28, -28, -1]) cylinder(d=3.2, h=30);
        }
    }
    
    // 4. LID MOUNTING POSTS (Heights updated to match new wall_height)
    lid_post_positions = [
        [west_wall_x + wall_thickness, -75 + wall_thickness],
        [east_wall_x - wall_thickness, -75 + wall_thickness],
        [east_wall_x - wall_thickness, north_wall_y - wall_thickness],
        [west_wall_x + wall_thickness, north_wall_y - wall_thickness]
    ];

    for (pos = lid_post_positions) {
        translate([pos[0], pos[1], wall_thickness]) 
        difference() {
            cylinder(r=6, h=wall_height - wall_thickness); 
            translate([0,0,-1]) cylinder(d=lid_screw_hole_d, h=wall_height + 2); 
        }
    }
}

super_base_v23_2_extended();